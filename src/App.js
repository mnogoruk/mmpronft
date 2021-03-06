import {BigNumber, ethers} from 'ethers'

import MMPRONFT from './artifacts/contracts/MMPRONFT.sol/MMPRONFT.json'
import IBEP20 from './artifacts/contracts/IBEP20.sol/IBEP20.json'
import {useCallback, useEffect, useState} from "react";
import popupStyles from "./custom-popup.module.css";

const provider = new ethers.providers.Web3Provider(window.ethereum);
const signer = provider.getSigner();


const mmmpronftAddress = '0x7eF383bcc99f30214a6d45581177AEcbEbdef19B'
const mmproAddress = '0xE700866c1468a5003877d756a45fFe4a0910730B'
const busdAddress = '0x78867BbEeF44f2326bF8DDd1941a4439382EF2A7'


const MMPRONFTContract = new ethers.Contract(mmmpronftAddress, MMPRONFT.abi, signer);
const MMPROContract = new ethers.Contract(mmproAddress, IBEP20.abi, signer);
const BUSDContract = new ethers.Contract(busdAddress, IBEP20.abi, signer);

const mmproSwapAmountMin = 4

const Loader = (props) => (
    <h3 {...props} >Loading...</h3>
);

async function getAccount() {
    const [ac] = await window.ethereum.request({method: 'eth_requestAccounts'})
    return ac
}

async function getNftBalance(userAccount) {
    return (await MMPRONFTContract.balanceOf(userAccount)).toNumber()
}

async function getBusdBalance(userAccount) {
    return (await BUSDContract.balanceOf(userAccount)).toString()

}

async function getMmproBalance(userAccount) {
    return (await MMPROContract.balanceOf(userAccount)).toString()

}

async function getNftPrice() {
    return (await MMPRONFTContract.nftPrice()).toString()
}

const AllowPopup = (props) => {
    const [show, setShow] = useState(false)
    const [allowBusdAmount, setAllowBusdAmount] = useState()
    const [loading, setLoading] = useState()

    const closeHandler = (e) => {
        setShow(false)
    };

    useEffect(() => {
        setShow(props.show)
    }, [props.show])

    const handleAllow = async  () => {
        const response = await BUSDContract.approve(mmmpronftAddress, BigNumber.from(allowBusdAmount))
        setLoading(true)
        await response.wait()
        setLoading(false)
        setShow(false)
    }

    return (
        <div
            style={{
                visibility: show ? "visible" : "hidden",
                opacity: show ? "1" : "0"
            }}
            className={popupStyles.overlay}
        >
            <div className={popupStyles.popup}>
                <h2>{props.title}</h2>
                <span className={popupStyles.close} onClick={closeHandler}>
          &times;
        </span>

                <div className={popupStyles.content}>Need allow some busd to trade.</div>
                <input type="number" value={allowBusdAmount} onChange={e => setAllowBusdAmount(e.target.value)}/>
                <button onClick={handleAllow}>allow</button>{loading ? <Loader/> : ""}
            </div>
        </div>
    );
};


function App() {
    const [userAccount, setUserAccount] = useState()
    const [tokenId, setTokenId] = useState()
    const [nftBalance, setNftBalance] = useState(0)
    const [busdBalance, setBusdBalance] = useState(0)
    const [mmproBalance, setMmproBalance] = useState(0)
    const [nftPrice, setNftPrice] = useState(0)

    const [everBoughtTokens, setEverBoughtTokens] = useState([])
    const [everSoldTokens, setEverSoldTokens] = useState([])

    const [ownedTokens, setOwnedTokens] = useState([])

    const [waitBuying, setWaitBuying] = useState(false)
    const [waitSelling, setWaitSelling] = useState(false)
    const [loadingTokenList, setLoadingTokenList] = useState(true)

    const [showPopup, setShowPopup] = useState(false)

    const authorized = useCallback(() => {
        return !!userAccount;
    }, [userAccount])

    const authorize = async () => {
        const account = await getAccount()
        setUserAccount(account)
    }

    const addOwnedToken = (tokenId) => {
        if (!ownedTokens.includes(tokenId)) {
            ownedTokens.push(tokenId)
            setOwnedTokens(ownedTokens)
            setNftBalance(nftBalance + 1)
        }
    }

    const removeOwnedToken = (tokenId) => {
        ownedTokens.splice(ownedTokens.indexOf(tokenId))
        setNftBalance(nftBalance - 1)
    }

    const buy = async () => {
        try {
            const swapDeadline = Math.floor(Date.now() / 1000) + 60
            const response = await MMPRONFTContract.buy(mmproSwapAmountMin, swapDeadline)
            setWaitBuying(true)
            await response.wait()
            setWaitBuying(false)
            await refreshBalance()
        } catch (e) {
            if (e.data.message === 'execution reverted: BEP20: transfer amount exceeds allowance') {
                setShowPopup(true)
            }
        }
    }

    const sell = async () => {
        const response = await MMPRONFTContract.sell(BigNumber.from(tokenId))
        setWaitSelling(true)
        await response.wait()
        setWaitSelling(false)
        await refreshBalance()
    }

    const refreshBalance = useCallback(async () => {
        const _nftBalance = await getNftBalance(userAccount)
        const _busdBalance = await getBusdBalance(userAccount)
        const _mmproBalance = await getMmproBalance(userAccount)
        const _nftPrice = await getNftPrice()
        setNftBalance(_nftBalance)
        setBusdBalance(_busdBalance)
        setMmproBalance(_mmproBalance)
        setNftPrice(_nftPrice)
    }, [userAccount])

    useEffect(() => {
        provider.on("accountsChanged", (_) => window.location.reload())
        provider.on("chainChanged", (_) => window.location.reload())
        MMPRONFTContract.on('Buy', (buyer, token) => {
            addOwnedToken(token.toNumber())
        })
        MMPRONFTContract.on('Sell', (buyer, token) => {
            removeOwnedToken(token.toNumber())
        })
    })

    useEffect(() => {
        if (authorized()) {
            async function _setBalance() {
                await refreshBalance()
            }

            _setBalance()
        }
    }, [userAccount, authorized, refreshBalance])


    useEffect(() => {
        if (authorized()) {
            const logFilterBuy = MMPRONFTContract.filters.Buy(userAccount)

            async function getBoughtToken() {
                const endBlock = await provider.getBlockNumber()
                const startBlock = 0
                const _ownedTokens = []

                for (let i = endBlock; i > startBlock; i -= 5000) {
                    let _endBlock = i;
                    let _startBlock = i - 5000;
                    let buyEvents = await MMPRONFTContract.queryFilter(logFilterBuy, _startBlock, _endBlock);

                    for (let event of buyEvents) {
                        let token = event.args[1].toNumber()
                        _ownedTokens.push(token)
                    }
                    setEverBoughtTokens(_ownedTokens)
                }
            }

            getBoughtToken()
        }
    }, [userAccount, authorized])

    useEffect(() => {
        if (authorized()) {
            const logFilterSell = MMPRONFTContract.filters.Sell(userAccount)

            async function getSoldTokens() {
                const endBlock = await provider.getBlockNumber()
                const startBlock = 0;
                const _soldTokens = []

                for (let i = endBlock; i > startBlock; i -= 5000) {
                    let _endBlock = i;
                    let _startBlock = i - 5000;
                    let buyEvents = await MMPRONFTContract.queryFilter(logFilterSell, _startBlock, _endBlock);

                    for (let event of buyEvents) {
                        let token = event.args[1].toNumber()
                        _soldTokens.push(token)
                    }
                    setEverSoldTokens(_soldTokens)
                }

            }

            getSoldTokens()
        }
    }, [userAccount, authorized])


    useEffect(() => {
        const tokens = everBoughtTokens.filter(token => !everSoldTokens.includes(token))
        setOwnedTokens(tokens)
        if ((tokens.length === nftBalance) && (nftBalance !== 0)) {
            setLoadingTokenList(false)
        }
    }, [everBoughtTokens, everSoldTokens, nftBalance])

    return (
        <div className="App">
            <button style={{display: 'block', marginLeft: 50, marginBottom: 10, marginTop: 10}}
                    onClick={authorize}>authorize
            </button>
            <h1 style={{margin: 50}}>User account: {userAccount}</h1>
            <h1 style={{margin: 50}}>NFT Balance: {nftBalance}</h1>
            <h1 style={{margin: 50}}>BUSD Balance: {busdBalance}</h1>
            <h1 style={{margin: 50}}>MMPRO Balance: {mmproBalance}</h1>
            <h1 style={{margin: 50}}>NFT Price: {nftPrice}</h1>

            <AllowPopup show={showPopup}/>
            <div style={{display: 'block', marginLeft: 50, marginBottom: 10, marginTop: 10}}>
                <button onClick={buy}>buy
                    token
                </button>
                {waitBuying ? <Loader/> : ""}

            </div>
            <div style={{display: 'block', marginLeft: 50, marginBottom: 10, marginTop: 10}}>
                <input type="text" value={tokenId} onChange={e => setTokenId(e.target.value)} placeholder={'Token ID'}/>
                <button onClick={sell}>sell</button>
                {waitSelling ? <Loader/> : ""}
            </div>
            <hr/>
            <div style={{display: 'block', marginLeft: 50, marginBottom: 10, marginTop: 10}}>
                <h3>List Tokens:</h3>
                <div>
                    {ownedTokens.map(token => <h3>{token}</h3>)}
                </div>
                {loadingTokenList && authorized() ? <Loader/> : ""}
            </div>
            <hr/>

        </div>
    );
}

export default App;
